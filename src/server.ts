import app from "./app";
import { prisma } from "./app/lib/prisma";
import { seedAdmin, seedDemoUsers } from "./app/utils/seed";
import config from "./config";

async function main() {
	const PORT = Number(config.port) || 5000;

	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");

		if (config.demo_accounts_enabled) {
			await seedDemoUsers();
		} else {
			await seedAdmin();
		}

		app.listen(PORT, () => {
			console.log(`Server is running on port: ${PORT}`);
		});
	} catch (error) {
		console.error("Error from the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
}

main();
