export const PAPER_STATUS = {
    DRAFT: 'DRAFT' as const,
    NIGHT_SUBMITTED: 'NIGHT_SUBMITTED' as const,
    MORNING_SUBMITTED: 'MORNING_SUBMITTED' as const,
    FINALIZED: 'FINALIZED' as const,
    REOPENED: 'REOPENED' as const,
} as const;

export type PaperStatus =
    typeof PAPER_STATUS[
    keyof typeof PAPER_STATUS
    ];


export const STATUS_TRANSITIONS: Record<
    PaperStatus,
    PaperStatus[]
> = {
    [PAPER_STATUS.DRAFT]: [
        PAPER_STATUS.NIGHT_SUBMITTED,
    ],

    [PAPER_STATUS.NIGHT_SUBMITTED]: [
        PAPER_STATUS.DRAFT,
        PAPER_STATUS.MORNING_SUBMITTED,
    ],

    [PAPER_STATUS.MORNING_SUBMITTED]: [
        PAPER_STATUS.NIGHT_SUBMITTED,
        PAPER_STATUS.FINALIZED,
    ],

    [PAPER_STATUS.FINALIZED]: [
        PAPER_STATUS.REOPENED,
    ],

    [PAPER_STATUS.REOPENED]: [
        PAPER_STATUS.MORNING_SUBMITTED,
        PAPER_STATUS.FINALIZED,
    ],
} as const;


export const EDITABLE_STATUSES = {
    NIGHT_EDITABLE: [
        PAPER_STATUS.DRAFT,
        PAPER_STATUS.REOPENED,
    ] as const,

    MORNING_EDITABLE: [
        PAPER_STATUS.NIGHT_SUBMITTED,
        PAPER_STATUS.REOPENED,
    ] as const,

    FINALIZABLE: [
        PAPER_STATUS.MORNING_SUBMITTED,
        PAPER_STATUS.REOPENED,
    ] as const,
};


export const DATE_CONFIG = {
    MAX_FUTURE_DAYS: 30,
    TIMEZONE: 'Asia/Kolkata',
    DAY_START_HOURS: 0,
    DAY_START_MINUTES: 0,
    DAY_START_SECONDS: 0,
} as const;


export const ERROR_MESSAGES = {
    // Sheet/Paper errors
    INVALID_PAPER_ID: 'Invalid paper ID provided',
    PAPER_NOT_FOUND: 'Order paper not found',

    // Status/Workflow errors
    NO_PAPERS_FOUND:
        'No papers found in system',

    NO_ACTIVE_GROUPS: 'No active groups found to generate sheets',
    INVALID_STATUS_TRANSITION: (current: PaperStatus, target: PaperStatus) =>
        `Cannot transition from ${current} to ${target}`,
    MUST_RESUBMIT_MORNING: (previousStatus: PaperStatus) =>
        `After reopening from ${previousStatus}, ` +
        `you must resubmit morning entry before finalizing`,


    INVALID_DATE_FORMAT: 'Invalid date format',
    PAST_DATE_NOT_ALLOWED: 'Cannot perform operations on past dates',
    FUTURE_DATE_TOO_FAR: (maxDays: number) =>
        `Cannot generate paper more than ${maxDays} days ahead`,
    MISSING_REQUIRED_FIELD: (fieldName: string) =>
        `Required field "${fieldName}" is missing`,
} as const;


export const SUCCESS_MESSAGES = {
    PAPER_GENERATED: (date: string) =>
        `Order paper generated successfully for ${date}`,
    NIGHT_ENTRIES_SUBMITTED: 'Night entries submitted successfully',
    MORNING_ENTRIES_SUBMITTED: 'Morning entries submitted successfully',
    PAPER_FINALIZED: 'Order paper finalized successfully',
    PAPER_REOPENED: 'Order paper reopened successfully',
} as const;
