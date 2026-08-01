// import { Injectable } from '@nestjs/common';

// import { PrismaService } from '../../../prisma/prisma.service.js';

// @Injectable()
// export class AuthRepository {
//   constructor(private readonly prisma: PrismaService) {}

//   async findUserByUsername(username: string) {
//     return this.prisma.users.findUnique({
//       where: {
//         username,
//       },

//       include: {
//         role: true,
//       },
//     });
//   }

//   async findUserById(id: number) {
//   return this.prisma.users.findUnique({
//     where: { id },
//     include: {
//       role: true,
//     },
//   });
// }
// }
