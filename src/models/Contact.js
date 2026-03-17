import { Schema, model } from "mongoose";

const contactSchema = new Schema(
  {
    name: { type: String },
    email: { type: String, lowercase: true },
    subject: { type: String },
    message: { type: String },
  },
  { timestamps: true }
);

export default model("Contact", contactSchema);
