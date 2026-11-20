export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role?: "CUSTOMER" | "TECHNICIAN";
};

export type LoginInput = {
  email: string;
  password: string;
};
