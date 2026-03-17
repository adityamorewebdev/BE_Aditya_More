import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import {
  createContactSchema,
  replaceContactSchema,
  updateContactSchema,
  paginationSchema,
} from "../schemas/contactSchema.js";
import {
  createContact,
  getContacts,
  getContactById,
  replaceContact,
  updateContact,
  deleteContact,
} from "../controllers/contactController.js";

const router = Router();

router.route("/")
  .post(validate(createContactSchema), asyncHandler(createContact))
  .get(validate(paginationSchema, "query"), asyncHandler(getContacts));

router.route("/:id")
  .get(asyncHandler(getContactById))
  .put(validate(replaceContactSchema), asyncHandler(replaceContact))
  .patch(validate(updateContactSchema), asyncHandler(updateContact))
  .delete(asyncHandler(deleteContact));

export default router;
