const appU = require("../app");

const jwtU = require("jsonwebtoken");

module.exports = async (id: number): Promise<string> => {
  const token = jwtU.sign(
    { id: id, person: "user" },
    process.env.RANDOM_SECRET,
    {
      expiresIn: "12h",
    }
  );
  const savedToken = await appU.prisma.tokenUser.create({
    data: {
      userId: id,
      token: token,
    },
  });
  return savedToken;
};
