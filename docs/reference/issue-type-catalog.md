# Issue Type Catalog

Complete catalog of all issues detected by Code Evolution Lab.

## Issue Types

| Issue Type | Severity | Category | Detector |
|------------|----------|----------|----------|
| `n_plus_1_query` | critical/high | performance | N+1 Query |
| `nested_loops` | critical/high | complexity | Inefficient Loop |
| `regex_compilation_in_loop` | medium | performance | Inefficient Loop |
| `json_operations_in_loop` | high | performance | Inefficient Loop |
| `array_lookup_in_loop` | high | complexity | Inefficient Loop |
| `await_in_loop` | high | performance | Inefficient Loop |
| `inefficient_array_chaining` | medium | performance | Inefficient Loop |
| `nested_array_methods` | high | complexity | Inefficient Loop |
| `dom_manipulation_in_loop` | high | performance | Inefficient Loop |
| `string_concat_in_loop` | medium | performance | Inefficient Loop |
| `event_listener_leak` | high | memory | Memory Leak |
| `timer_leak` | critical | memory | Memory Leak |
| `global_variable_leak` | medium | memory | Memory Leak |
| `closure_memory_leak` | medium | memory | Memory Leak |
| `large_api_payload` | high | network | Large Payload |
| `select_all_query` | medium | performance | Large Payload |
| `large_return_payload` | high | memory | Large Payload |

---

## Detailed Descriptions

### N+1 Query Detector

#### `n_plus_1_query`

| Property | Value |
|----------|-------|
| **Severity** | critical (100+ queries), high (10-100), medium (<10) |
| **Category** | performance |
| **Confidence** | 85% |

**Description:** Database query executed inside a loop, causing N+1 queries for N items.

**Example:**
```javascript
// ❌ Problem
for (const user of users) {
  const orders = await db.orders.findMany({ where: { userId: user.id } });
}

// ✅ Solution
const orders = await db.orders.findMany({
  where: { userId: { in: users.map(u => u.id) } }
});
```

---

### Inefficient Loop Detector

#### `nested_loops`

| Property | Value |
|----------|-------|
| **Severity** | critical (depth ≥3), high (depth 2) |
| **Category** | complexity |
| **Confidence** | 90% |

**Description:** Nested loops creating O(n²) or O(n³) complexity.

#### `regex_compilation_in_loop`

| Property | Value |
|----------|-------|
| **Severity** | medium |
| **Category** | performance |
| **Confidence** | 75% |

**Description:** Regular expression compiled on every loop iteration.

#### `json_operations_in_loop`

| Property | Value |
|----------|-------|
| **Severity** | high |
| **Category** | performance |
| **Confidence** | 85% |

**Description:** JSON.parse or JSON.stringify called inside loop.

#### `array_lookup_in_loop`

| Property | Value |
|----------|-------|
| **Severity** | high |
| **Category** | complexity |
| **Confidence** | 85% |

**Description:** Array.find, Array.includes, or Array.indexOf in nested loop.

#### `await_in_loop`

| Property | Value |
|----------|-------|
| **Severity** | high |
| **Category** | performance |
| **Confidence** | 90% |

**Description:** Sequential await instead of Promise.all for independent operations.

#### `inefficient_array_chaining`

| Property | Value |
|----------|-------|
| **Severity** | medium |
| **Category** | performance |
| **Confidence** | 80% |

**Description:** Chained filter().map() creating intermediate arrays.

#### `nested_array_methods`

| Property | Value |
|----------|-------|
| **Severity** | high |
| **Category** | complexity |
| **Confidence** | 75% |

**Description:** Nested forEach/map callbacks at depth ≥2.

---

### Memory Leak Detector

#### `event_listener_leak`

| Property | Value |
|----------|-------|
| **Severity** | high |
| **Category** | memory |
| **Confidence** | 85% |

**Description:** addEventListener without corresponding removeEventListener.

#### `timer_leak`

| Property | Value |
|----------|-------|
| **Severity** | critical |
| **Category** | memory |
| **Confidence** | 90% |

**Description:** setInterval without clearInterval cleanup.

#### `global_variable_leak`

| Property | Value |
|----------|-------|
| **Severity** | medium |
| **Category** | memory |
| **Confidence** | 65% |

**Description:** Growing global arrays or objects.

#### `closure_memory_leak`

| Property | Value |
|----------|-------|
| **Severity** | medium |
| **Category** | memory |
| **Confidence** | 55% |

**Description:** Closures retaining references to large objects.

---

### Large Payload Detector

#### `large_api_payload`

| Property | Value |
|----------|-------|
| **Severity** | high |
| **Category** | network |
| **Confidence** | 80% |

**Description:** API returning excessive data without filtering.

#### `select_all_query`

| Property | Value |
|----------|-------|
| **Severity** | medium |
| **Category** | performance |
| **Confidence** | 75% |

**Description:** SELECT * without explicit column selection.

---

## Severity Levels

| Level | Score | Description |
|-------|-------|-------------|
| **critical** | 9 | Immediate fix required. Severe impact. |
| **high** | 7 | Significant impact. Fix soon. |
| **medium** | 5 | Moderate impact. Improvement recommended. |
| **low** | 3 | Minor issue. Optional improvement. |

## Categories

| Category | Description |
|----------|-------------|
| **performance** | Runtime performance or response times |
| **memory** | Memory usage or leak potential |
| **complexity** | Algorithmic complexity (Big-O) |
| **network** | Data transfer or API efficiency |

## Confidence Scores

Confidence indicates detection accuracy:

| Range | Meaning |
|-------|---------|
| 90-100% | Very high confidence, clear pattern |
| 75-89% | High confidence, likely issue |
| 60-74% | Moderate confidence, review recommended |
| <60% | Lower confidence, may be false positive |
