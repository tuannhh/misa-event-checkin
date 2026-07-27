// Gộp toàn bộ module route lại thành 1 router, mount ở server.js: app.use('/api', require('./routes'))
// Trước đây toàn bộ nằm chung 1 file routes/api.js (1128 dòng) - nay tách theo nghiệp vụ để
// dễ đọc/dễ diff/dễ giao cho nhiều người sửa cùng lúc, KHÔNG đổi bất kỳ đường dẫn (path) hay
// hành vi API nào so với trước.
const express = require('express');
const router = express.Router();

router.use(require('./auth'));
router.use(require('./users'));
router.use(require('./events'));
router.use(require('./staff-roles'));
router.use(require('./attendee-groups'));
router.use(require('./print'));
router.use(require('./attendees'));
router.use(require('./checkin'));
router.use(require('./monitor'));
router.use(require('./badges'));
router.use(require('./email'));
router.use(require('./reports'));
router.use(require('./options'));

module.exports = router;
