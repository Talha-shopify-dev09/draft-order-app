import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

/**
 * Generates the next unique ID in the format npdfXXX (e.g., npdf001, npdf002).
 * Stores and increments the counter in the AppSetting table.
 * @returns {Promise<string>} The next unique ID.
 */
export async function getNextNpdfId() {
  const counterKey = "npdfIdCounter";

  // Use a transaction to ensure atomicity when updating the counter
  const result = await prisma.$transaction(async (tx) => {
    let appSetting = await tx.appSetting.findUnique({
      where: { key: counterKey },
    });

    let nextNumber;
    if (appSetting) {
      nextNumber = parseInt(appSetting.value) + 1;
      await tx.appSetting.update({
        where: { key: counterKey },
        data: { value: nextNumber.toString() },
      });
    } else {
      // Initialize counter if it doesn't exist
      nextNumber = 1;
      await tx.appSetting.create({
        data: { key: counterKey, value: nextNumber.toString() },
      });
    }
    return nextNumber;
  });

  // Format the number to npdfXXX
  return `npdf${result.toString().padStart(3, '0')}`;
}
