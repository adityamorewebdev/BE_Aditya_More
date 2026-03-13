import Contact from "../models/Contact.js";

export const createContact = async (req, res) => {
  const contact = await Contact.create(req.body);
  res.status(201).json({ success: true, data: contact });
};

export const getContacts = async (req, res) => {
  const { page, limit } = req.query;
  const skip = (page - 1) * limit;

  const [contacts, total] = await Promise.all([
    Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Contact.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: contacts,
  });
};

export const getContactById = async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }

  res.status(200).json({ success: true, data: contact });
};

export const replaceContact = async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true, overwrite: true }
  );

  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }

  res.status(200).json({ success: true, data: contact });
};

export const updateContact = async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }

  res.status(200).json({ success: true, data: contact });
};

export const deleteContact = async (req, res) => {
  const contact = await Contact.findByIdAndDelete(req.params.id);

  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }

  res.status(200).json({
    success: true,
    message: "Contact deleted successfully",
    data: contact,
  });
};
