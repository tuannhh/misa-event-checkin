// Danh mục lựa chọn dùng chung cho frontend (dropdown/select)
const express = require('express');
const { requireLogin, POSITIONS, COMPANY_SIZES, ROLES, SALUTATIONS, IMPORTANCES, ELIGIBILITY_FIELDS } = require('./lib/helpers');

const router = express.Router();

router.get('/options', requireLogin, (req, res) => res.json({
  positions: POSITIONS, company_sizes: COMPANY_SIZES, roles: ROLES,
  salutations: SALUTATIONS, importances: IMPORTANCES,
  eligibility_fields: Object.fromEntries(Object.entries(ELIGIBILITY_FIELDS).map(([k, v]) => [k, v])),
}));

module.exports = router;
