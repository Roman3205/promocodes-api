const checkPromoActiveViaDate = require("./checkPromoActiveViaDate");

module.exports = (
  active_from: string,
  active_until: string,
  mode: string,
  promo_unique: string[],
  max_count: number,
  used_count: number,
  active: boolean
): boolean => {
  let c1 = checkPromoActiveViaDate(active_from, active_until);
  let c2 = mode == "UNIQUE" ? promo_unique.length > 0 : true;
  let c3 = mode == "COMMON" ? max_count > used_count : true;
  let c4 = active;

  if (c1 && c2 && c3 && c4) {
    return true;
  }

  return false;
};
