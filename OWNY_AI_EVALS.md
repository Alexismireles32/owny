# Owny AI Evals

This repo now has an Owny-native AI eval layer for the parts that matter most:

1. topic suggestion quality
2. transcript retrieval quality

Run it with:

```bash
npm run test:ai-evals
```

What it checks today:

1. topic suggestions are specific, problem-based, and not generic content buckets
2. retrieval refinement can recover missing evidence using iterative search passes

Where to extend it next:

1. add creator-specific topic suggestion fixtures
2. add retrieval fixtures for each product type
3. add build-quality graders for saved HTML outputs
