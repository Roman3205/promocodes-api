const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc.js");

dayjs.extend(utc);

module.exports = (from: string, until: string): boolean => {
  let time = dayjs().utc({ keepLocalTime: false });
  let fromTime = dayjs(from).utc({ keepLocalTime: false });
  let untilTime = dayjs(until).utc({ keepLocalTime: false });

  if (!until && from) {
    return time.isSame(fromTime, "day") || time.isAfter(fromTime);
  }

  if (!from && until) {
    return time.isSame(untilTime, "day") || time.isBefore(untilTime);
  }

  if (from && until) {
    let c1 = time.isSame(fromTime, "day") || time.isAfter(fromTime);
    let c2 = time.isSame(untilTime, "day") || time.isBefore(untilTime);
    return c1 && c2;
  }

  return true;
};
