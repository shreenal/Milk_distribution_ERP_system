import { Module }
    from '@nestjs/common';

import { PrismaModule }
    from '../../prisma/prisma.module.js';

import { CollectionsController }
    from './collections.controller.js';

import { CollectionsService }
    from './collections.service.js';

import { CollectionsRepository }
    from './collections.repository.js';

import { CollectionBuilder }
    from './collections.builder.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { CollectionsValidationService } from './collections-validation.service.js';


@Module({

    imports: [

        PrismaModule,
        WorkflowModule
    ],

    controllers: [

        CollectionsController,
    ],

    providers: [

        CollectionsService,

        CollectionsRepository,

        CollectionBuilder,
        CollectionsValidationService,
    ],

    exports: [

        CollectionsService,
        CollectionsValidationService,
    ],
})
export class CollectionsModule { }