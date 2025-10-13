import { z } from "zod";

// Example item schema
export const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.string(),
});

// Widget output schemas with discriminators
export const ItemListOutputSchema = z.object({
  kind: z.literal("item_list"),
  items: z.array(ItemSchema),
});

export const ItemDetailOutputSchema = ItemSchema.extend({
  kind: z.literal("item_detail"),
});

// Inferred TypeScript types
export type Item = z.infer<typeof ItemSchema>;
export type ItemListOutput = z.infer<typeof ItemListOutputSchema>;
export type ItemDetailOutput = z.infer<typeof ItemDetailOutputSchema>;

// Discriminated union for all widget states
export type WidgetState = ItemListOutput | ItemDetailOutput;
