import pg from "pg";
import { PORTS, LOCAL_HOST, TEST_DATABASE } from "../constants/environment.constant.ts";

export const createTestDatabaseClient = (database: string = TEST_DATABASE.NAME): pg.Client =>
  new pg.Client({
    database,
    host: LOCAL_HOST,
    port: PORTS.DATABASE,
    user: TEST_DATABASE.USER,
    password: TEST_DATABASE.PASSWORD,
  });
