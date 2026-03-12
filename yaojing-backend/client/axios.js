const axios = require("axios");

const request = axios.create({
  baseURL: "http://localhost:3000/api",
  timeout: 10000
});

request.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
);

module.exports = request;
