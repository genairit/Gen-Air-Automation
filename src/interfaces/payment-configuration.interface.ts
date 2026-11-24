export interface IPaymentStage {
  text: string;
  percent: string;
}

export interface IPaymentConfiguration {
  paymentTerms: string | null;
  paymentSchedule: IPaymentStage[];
}

export interface ICustomerPaymentConfiguration extends IPaymentConfiguration {
  id: string;
  name: string;
}

export interface IPaymentScheduleColumn {
  data_type: string;
  is_nullable: string;
}
