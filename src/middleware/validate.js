const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  if (source === 'body' || source === 'params') {
    req[source] = result.data;
  } else if (source === 'query') {
    req.validatedQuery = result.data;
  }
  
  next();
};

export default validate;