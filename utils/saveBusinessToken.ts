const appB = require("../app");

const jwtB = require("jsonwebtoken");

module.exports = async (id: number): Promise<string> => {
  const token = jwtB.sign(
    { id: id, person: "business" },
    process.env.RANDOM_SECRET,
    {
      expiresIn: "12h",
    }
  );
  const savedToken = await appB.prisma.tokenBusiness.create({
    data: {
      businessId: id,
      token: token,
    },
  });
  return savedToken;
};
