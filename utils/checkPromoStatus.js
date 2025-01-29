import checkPromoActiveViaDate from "./checkPromoActiveViaDate.js"

export default (active_from, active_until, mode, promo_unique, max_count, used_count, active) => {
    let c1 = checkPromoActiveViaDate(active_from, active_until)
    let c2 = mode == 'UNIQUE' ? promo_unique.length > 0 : true
    let c3 = mode == 'COMMON' ? max_count > used_count : true
    let c4 = active

    if (c1 && c2 && c3 && c4) {
        return true
    }

    return false
}
