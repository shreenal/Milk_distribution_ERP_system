import { IsNumber, Max, Min } from "class-validator";

export class SaveNightEntriesDto {
    @IsNumber()
    @Min(1)
    clientId!: number;

    @IsNumber()
    @Min(1)
    productId!: number;

    @IsNumber()
    @Min(0)
    @Max(10000)
    orderedQty!: number;
}