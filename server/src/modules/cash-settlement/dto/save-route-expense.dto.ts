import {
    IsArray,
    IsInt,
    IsNumber,
    Min,
    ValidateNested,
} from 'class-validator';

import {
    Type,
} from 'class-transformer';

export class SaveRouteExpensesDto {

    @IsArray()
    @ValidateNested({
        each: true,
    })
    @Type(() => RouteExpenseDto)
    expenses!: RouteExpenseDto[];
}


export class RouteExpenseDto {

    @IsInt()
    sheetId!: number;

    @IsInt()
    expenseTypeId!: number;

    @IsNumber()
    @Min(0)
    amount!: number;
}