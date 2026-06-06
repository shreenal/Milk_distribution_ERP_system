import { Type } from "class-transformer";
import { IsInt, Min, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from "class-validator";

export class EmployeeCollectionEntryDto {

    @IsInt()
    @Min(1)
    clientId!: number;

    @IsNumber()
    @Min(0)
    cashCollection!: number;

    @IsNumber()
    @Min(0)
    officeAmountGiven!: number;

    @IsNumber()
    @Min(0)
    chequeCollection!: number;

    @IsOptional()
    @IsString()
    employeeRemarks?: string;
}


export class SaveEmployeeCollectionsDto {

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EmployeeCollectionEntryDto)
    entries!: EmployeeCollectionEntryDto[];
}