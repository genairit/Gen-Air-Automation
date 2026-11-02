import type { TGenAirApi } from "./gen-air-api.ts";
import { quotationDocument } from "./quotation.api.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { seedQuotationDesign } from "./quotation-design-fixture.ts";
import type { IQuotationDocument } from "../interfaces/quotation.interface.ts";
import { QUOTATION, type QuotationStatusType } from "../constants/quotation.constant.ts";

export const seedQuotationForDeletion = async (api: TGenAirApi, status: QuotationStatusType) => {
  const fixture = await seedQuotationDesign(api);
  const transition = async (quotation: IQuotationDocument, target: QuotationStatusType) =>
    quotationDocument(
      await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/review`, {
        version: quotation.version,
        status: target,
      }),
    );
  const builders: Record<QuotationStatusType, () => Promise<IQuotationDocument>> = {
    [QUOTATION.STATUS.DRAFT]: async () => fixture.quotation,
    [QUOTATION.STATUS.REVIEW]: () => transition(fixture.quotation, QUOTATION.STATUS.REVIEW),
    [QUOTATION.STATUS.APPROVED]: async () => {
      const review = await builders[QUOTATION.STATUS.REVIEW]();
      const acknowledged = await quotationDocument(
        await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/warnings`, {
          version: review.version,
          warningKeys: review.warnings.map(warning => warning.key),
        }),
      );
      return transition(acknowledged, QUOTATION.STATUS.APPROVED);
    },
  };
  return { ...fixture, quotation: await builders[status]() };
};
