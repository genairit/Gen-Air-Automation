import {
  CUSTOMER_SYNC_STATUSES,
  type CustomerSyncStatusType,
} from "../constants/domain.constant.ts";

import { createTestDatabaseClient } from "./test-database-client.ts";
import { LEGACY_APARTMENT } from "../constants/apartment-backend.constant.ts";

export const setApartmentCustomerSyncStatus = async (
  customerId: string,
  status: CustomerSyncStatusType,
): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE customers SET priority_sync_status = $2, priority_id = CASE WHEN $3 THEN 'qa-' || id::text ELSE NULL END, priority_synced_at = CASE WHEN $3 THEN NOW() ELSE NULL END WHERE id = $1",
      [customerId, status, status === CUSTOMER_SYNC_STATUSES.SYNCED],
    );
  } finally {
    await database.end();
  }
};

export const recreateLegacyApartment = async (apartmentId: string): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE projects SET customer_id = NULL, customer_name = $2, customer_phone = $3, contact_name = $4, contact_phone = $5 WHERE id = $1",
      [
        apartmentId,
        LEGACY_APARTMENT.CUSTOMER_NAME,
        LEGACY_APARTMENT.CUSTOMER_PHONE,
        LEGACY_APARTMENT.CONTACT_NAME,
        LEGACY_APARTMENT.CONTACT_PHONE,
      ],
    );
  } finally {
    await database.end();
  }
};
