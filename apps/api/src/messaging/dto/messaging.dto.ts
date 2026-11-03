import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  participantId!: string;

  @IsOptional()
  @IsUUID()
  childId?: string;
}

export class SearchContactsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class ListConversationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class MessageHistoryDto {
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;
}

export class SendMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;
}

export class ConversationIdDto {
  @IsUUID()
  conversationId!: string;
}

export class MessageIdDto {
  @IsUUID()
  messageId!: string;
}

export class TypingDto {
  @IsUUID()
  conversationId!: string;
}
