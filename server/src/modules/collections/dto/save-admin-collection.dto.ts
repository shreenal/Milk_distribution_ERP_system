import { Type } from "class-transformer";
import { IsInt, Min, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from "class-validator";

export class AdminCollectionEntryDto {

    @IsInt()
    @Min(1)
    clientId!: number;

    @IsNumber()
    @Min(0)
    onlineCollection!: number;

    @IsNumber()
    @Min(0)
    bankDeposit!: number;

    @IsOptional()
    @IsString()
    adminRemarks?: string;
}

export class SaveAdminCollectionsDto {

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AdminCollectionEntryDto)
    entries!: AdminCollectionEntryDto[];
}