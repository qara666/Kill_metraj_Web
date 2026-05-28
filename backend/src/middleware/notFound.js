const notFound = (req, res, next) => {
  const error = new Error(`Маршрут не найден - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { notFound };




