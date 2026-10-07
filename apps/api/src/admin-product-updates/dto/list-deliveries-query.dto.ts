import { IsIn, IsOptional } from "class-validator";

import {
  DELIVERY_LIST_FILTERS,
  type DeliveryListFilter,
} from "../delivery-list-filter";
import { PageQueryDto } from "./page-query.dto";

export class ListDeliveriesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(DELIVERY_LIST_FILTERS)
  filter?: DeliveryListFilter;
}
