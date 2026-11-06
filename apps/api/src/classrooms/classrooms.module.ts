import { Module } from "@nestjs/common";
import { ClassroomsController } from "./classrooms.controller.js";
import { ClassroomsService } from "./classrooms.service.js";

@Module({
  controllers: [ClassroomsController],
  providers: [ClassroomsService],
  exports: [ClassroomsService],
})
export class ClassroomsModule {}
