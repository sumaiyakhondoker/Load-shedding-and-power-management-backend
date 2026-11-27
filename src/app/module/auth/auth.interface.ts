export type RegisterInput = {
	name: string;
	email: string;
	password: string;
	role?: "CUSTOMER";
};

export type LoginInput = {
	email: string;
	password: string;
};
