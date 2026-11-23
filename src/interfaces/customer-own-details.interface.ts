export interface ICustomerOwnContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface ICustomerOwnDetails {
  id: string;
  name: string;
  primaryContactId: string | null;
  primaryContact: ICustomerOwnContact | null;
}
