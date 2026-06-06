import {
    IsArray,
    ValidateNested,
    IsInt,
    Min,
    IsNumber,
    IsOptional,
    IsString,
} from 'class-validator';

import { Type } from 'class-transformer';

export class MorningCollectionEntryDto {

    @IsInt()
    @Min(1)
    clientId!: number;

    @IsNumber()
    @Min(0)
    cashCollection!: number;

    @IsNumber()
    @Min(0)
    chequeCollection!: number;

    @IsOptional()
    @IsString()
    employeeRemarks?: string;
}

export class SaveMorningCollectionsDto {

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MorningCollectionEntryDto)
    entries!: MorningCollectionEntryDto[];
}