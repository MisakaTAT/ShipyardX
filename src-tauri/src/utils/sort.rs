use std::cmp::Ord;

pub fn sort_by_created_desc_then_id<T, C, I, FC, FI>(list: &mut [T], created_of: FC, id_of: FI)
where
    C: Ord,
    I: Ord,
    FC: Fn(&T) -> C,
    FI: Fn(&T) -> I,
{
    list.sort_by(|a, b| created_of(b).cmp(&created_of(a)).then_with(|| id_of(a).cmp(&id_of(b))));
}
