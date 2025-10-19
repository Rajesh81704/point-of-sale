class ResponseBody {
  constructor() {
    this.data = null;
    this.error = null;
    this.message = null;
    this.setStatusCode = null;
  }

  setData(data, message, statusCode) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
      this.error = "No data found";
      this.data = null;
      this.message = message || "No data found";
      this.setStatusCode = statusCode || 404;
    } else {
      this.data = data;
      this.error = null;
      this.message = message || "Request successful";
      this.setStatusCode = statusCode || 200;
    }
  }

  captureError(err) {
    this.data = null;
    this.error = err?.message || "Unexpected error occurred";
    this.setStatusCode = 500;
  }

  getResponse() {
    return {
      statusCode: this.setStatusCode,
      body: {
        data: this.data,
        error: this.error,
        message: this.message
      }
    };
  }

  send(res) {
    const response = this.getResponse();
    return res.status(response.statusCode).json(response.body);
  }
}

export { ResponseBody };
