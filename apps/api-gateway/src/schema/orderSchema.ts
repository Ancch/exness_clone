// import { z } from "zod";

// export const createOrderSchema = z.object({
//   symbol: z
//     .string()
//     .min(1, "Symbol is required")
//     .transform((val) => val.toUpperCase()),

//   side: z.enum(["BUY", "SELL"], {
//     errorMap: () => ({ message: "Side must be BUY or SELL" }),
//   }),

//   type: z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"], {
//     errorMap: () => ({
//       message: "Invalid order type",
//     }),
//   }),

//   quantity: z
//     .number({
//       required_error: "Quantity is required",
//       invalid_type_error: "Quantity must be a number",
//     })
//     .positive("Quantity must be greater than 0"),

//   requestedPrice: z
//     .number()
//     .positive("Requested price must be greater than 0")
//     .optional(),

//   accountId: z.string().uuid("Invalid accountId"),

//   leverage: z
//     .number({
//       invalid_type_error: "Leverage must be a number",
//     })
//     .int("Leverage must be an integer")
//     .min(1)
//     .max(1000)
//     .optional(),
// });