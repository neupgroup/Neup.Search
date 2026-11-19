"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const CategoryTypeSchema = z.enum(["page", "site"])

// Create a category and ensure its optional parent belongs to the same category type.
export async function createCategory(formData: FormData) {
  const parsed = z.object({
    type: CategoryTypeSchema,
    name: z.string().trim().min(1).max(120),
    parentId: z.string(),
  }).safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    parentId: formData.get("parentId") || "",
  })

  if (!parsed.success) throw new Error("Enter a valid category type and name.")

  if (parsed.data.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parsed.data.parentId }, select: { type: true } })
    if (!parent || parent.type !== parsed.data.type) throw new Error("Choose a parent with the same category type.")
  }

  await prisma.category.create({
    data: {
      type: parsed.data.type,
      name: parsed.data.name,
      parentId: parsed.data.parentId || null,
    },
  })

  revalidatePath("/manage/categories")
}

// Clear matching category values and detach children before deleting a category.
export async function deleteCategory(formData: FormData) {
  const id = String(formData.get("id") || "")
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid category ID.")

  const category = await prisma.category.findUnique({ where: { id }, select: { id: true, type: true, name: true } })
  if (!category) return

  await prisma.$transaction(async (transaction) => {
    if (category.type === "site") {
      await transaction.domain.updateMany({ where: { categories: category.name }, data: { categories: null } })
    } else {
      await transaction.page.updateMany({ where: { category: category.name }, data: { category: null } })
    }

    await transaction.category.updateMany({ where: { parentId: category.id }, data: { parentId: null } })
    await transaction.category.delete({ where: { id: category.id } })
  })

  revalidatePath("/manage/categories")
  revalidatePath("/manage/discovery/pages")
  revalidatePath("/manage/enhancements/site")
}
