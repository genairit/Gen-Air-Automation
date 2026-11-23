export interface ILegacyDriveItem {
  id: string;
  name: string;
  version: string;
  mimeType: string;
  trashed: boolean;
  parents: string[];
}

export interface ILegacyDriveTree {
  root: ILegacyDriveItem;
  file: ILegacyDriveItem;
  nested: ILegacyDriveItem;
  items: ILegacyDriveItem[];
  residents: ILegacyDriveItem;
  quotations: ILegacyDriveItem;
  firstApartment: ILegacyDriveItem;
  secondApartment: ILegacyDriveItem;
}
