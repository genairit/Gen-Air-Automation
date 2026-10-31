const migrationDate = (fileName: string) => {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(fileName);
  if (!match) throw new Error(`Migration has no sortable date: ${fileName}`);
  return `${match[1]}${match[2]}${match[3]}`;
};

export const compareMigrationFiles = (left: string, right: string) =>
  migrationDate(left).localeCompare(migrationDate(right)) || left.localeCompare(right);
