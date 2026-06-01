import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Activity log list endpoints inherit shared pagination (page,
// pageSize). They expose no sort knob — activity is always returned
// newest-first; surfacing sort would let callers ask for combinations
// (action asc, then createdAt desc?) that have no product meaning here
// and would let unbounded query strings reach Prisma.
export class ActivityQueryDto extends PaginationQueryDto {}
