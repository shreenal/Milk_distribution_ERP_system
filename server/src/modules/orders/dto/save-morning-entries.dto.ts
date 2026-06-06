import { IsNumber, Min, Max } from "class-validator";

export class SaveMorningEntriesDto {
    @IsNumber()
    @Min(1)
    clientId!: number;

    @IsNumber()
    @Min(1)
    productId!: number;

    @IsNumber()
    @Min(0)
    @Max(10000)
    deliveredQty!: number;
}