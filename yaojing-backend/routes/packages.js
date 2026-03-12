const express = require('express');

const router = express.Router();

router.use((req, res) => {
  res.status(501).json({
    success: false,
    data: null,
    message: 'packages api is not implemented in mysql backend',
  });
});

module.exports = router;
