import { createTestDatabaseClient } from "./test-database-client.ts";
import type { IPaymentScheduleColumn } from "../interfaces/payment-configuration.interface.ts";

export const setLegacyCustomerOtherPayment = async (customerId: string): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE customers SET payment_terms = 'other', payment_schedule = '[]'::jsonb WHERE id = $1",
      [customerId],
    );
  } finally {
    await database.end();
  }
};

export const readCustomerPaymentColumn = async (): Promise<IPaymentScheduleColumn[]> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<IPaymentScheduleColumn>(
      "SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'payment_schedule'",
    );
    return result.rows;
  } finally {
    await database.end();
  }
};
