import { Type } from "class-transformer";
import { IsArray, ValidateNested, IsInt, IsNumber } from "class-validator";

export class SaveRouteDenominationsDto {

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RouteDenominationDto)
    denominations!: RouteDenominationDto[];
}

export class RouteDenominationDto {

    @IsInt()
    sheetId!: number;

    @IsInt()
    note2000!: number;

    @IsInt()
    note500!: number;

    @IsInt()
    note200!: number;

    @IsInt()
    note100!: number;

    @IsInt()
    note50!: number;

    @IsInt()
    note20!: number;

    @IsInt()
    note10!: number;

    @IsNumber()
    coins!: number;
}