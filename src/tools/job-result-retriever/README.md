# Job Result Retriever Tool (`get-job-result`)

**Status**: Production Ready | **Function**: Asynchronous Job Management | **Features**: Adaptive Polling & Rate Limiting

## Overview

This tool retrieves the final result of an asynchronous background job that was previously initiated by another tool (like `generate-task-list`, `run-workflow`, etc.).

**Production Highlights:**
- **Asynchronous Job Management**: Retrieves results from background job execution
- **Adaptive Polling**: Intelligent polling recommendations with exponential backoff
- **Rate Limiting**: Server-side protection against excessive polling
- **Real-Time Status**: Live job status updates with progress tracking
- **Error Resilience**: Comprehensive error handling and recovery strategies

## Inputs

| Parameter | Type     | Description                                  | Required |
| :-------- | :------- | :------------------------------------------- | :------- |
| `jobId`   | `string` | The unique ID of the job whose result is needed. | Yes      |

### Example Input JSON

```json
{
  "jobId": "some-unique-job-identifier-123"
}
```

## Outputs

*   **Primary Output:** The `CallToolResult` object that was stored by the background job upon its completion or failure. This could contain the final generated content (e.g., task list, code snippet) or error details.
*   **File Storage:** This tool does not save any files itself; it retrieves results potentially saved by other tools.

## Output Schema


The tool returns a standard `CallToolResult` object. The `content` field within this result will be an array, typically containing a single text element. The text describes the job's current status or provides its final result.

The structure of the `text` content varies based on the job's state:
*   **Job PENDING**: Indicates the job is queued.
  * Example `text`: `Job 'some-unique-job-identifier-123' is pending.`
*   **Job RUNNING**: Indicates the job is actively processing.
  * Example `text`: `Job 'some-unique-job-identifier-123' is running.`
*   **Job COMPLETED Successfully**:
  * If the job produced a structured result, it's often stringified within the `text`.
    Example `text`: `Job 'some-unique-job-identifier-123' completed successfully. Result: { "output": "This is the detailed job output" }`
  * If the job completed with no specific additional output beyond success.
    Example `text`: `Job 'some-unique-job-identifier-123' completed successfully. No additional result output.`
*   **Job FAILED**: Indicates an error occurred during job execution. The `text` will contain details about the failure.
  * Example `text`: `Job 'some-unique-job-identifier-123' failed. Error: An error message detailing the failure.`
*   **Job ID Not Found**: If the provided `jobId` does not correspond to any known job.
  * Example `text`: `Job with ID 'invalid-job-id' not found.`

### Example Output JSON (for a COMPLETED job with a structured result)

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' completed successfully. Result: { \"data\": \"final output\" }"
    }
  ],
  "isError": false
}
```

*(Note: The `isError` flag in the outer `CallToolResult` will be `false` if the `get-job-result` tool itself executed successfully in retrieving the status. The success or failure of the *underlying* job is conveyed within the `text` content.)*

### Example Output JSON (for a RUNNING job)

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' is running."
    }
  ],
  "isError": false
}
```

### Example Output JSON (for a FAILED job reported by `get-job-result`)

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' failed. Error: Something went wrong during execution."
    }
  ],
  "isError": false
}
```

*(The `get-job-result` tool itself succeeded; it's reporting the status of the job which failed).*

## Workflow

```mermaid
flowchart TD
    A[Start get-job-result] --> B{Validate Input Schema};
    B --> |Invalid| Z[Return Error: Invalid Job ID Format];
    B --> |Valid| C[Get JobManager Instance];
    C --> D[Call jobManager.getJob(jobId)];
    D --> E{Job Found?};
    E --> |No| F[Return Error: Job Not Found];
    E --> |Yes| G{Job Status?};
    G -- PENDING/RUNNING --> H[Return Info: Job Still Processing];
    G -- COMPLETED/FAILED --> I[Return Stored Job Result (Success or Error)];
    F --> X[End];
    H --> X;
    I --> X;
    Z --> X;
```

1.  **Validate Input:** The `jobId` parameter is validated.
2.  **Get Job Manager:** Retrieves the singleton instance of the `JobManager` service.
3.  **Retrieve Job:** Calls `jobManager.getJob(jobId)` to fetch the job's state.
4.  **Check Status:**
    *   If the job is not found, returns an error.
    *   If the job status is `PENDING` or `RUNNING`, returns an informational message indicating the job is still in progress.
    *   If the job status is `COMPLETED` or `FAILED`, retrieves the stored `result` (which is a `CallToolResult` object) from the job record.
5.  **Return Result:** Returns the stored `CallToolResult` from the completed/failed job.

## Usage Example

```json
{
  "tool_name": "get-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```

Invoked via AI Assistant (after getting a Job ID from another tool):
`"Get the result for job ID 123e4567-e89b-12d3-a456-426614174000"`

### Improved Client-Side JavaScript Example

A client application would typically call this tool periodically after initiating a long-running operation that returned a `jobId`. This example implements adaptive polling with exponential backoff:

```javascript
// Improved client-side JavaScript with adaptive polling
async function pollJobStatus(mcpClient, jobId, initialInterval = 1000) {
  let interval = initialInterval;
  let maxInterval = 10000; // 10 seconds

  while (true) {
    // Wait for the current interval
    await new Promise(resolve => setTimeout(resolve, interval));

    try {
      // Check job status
      const result = await mcpClient.callTool('get-job-result', { jobId });

      if (result.isError) {
        console.error("Error calling get-job-result tool:", result.content[0]?.text || "Unknown error");
        return result; // Return the error result
      }

      const textContent = result.content[0]?.text || "";
      console.log("Job Status:", textContent);

      // Check if the job is completed or failed
      if (textContent.includes("completed successfully") || textContent.includes("failed")) {
        // Job is done, return the result
        return result;
      }

      // Check if rate limited
      if (result.rateLimit) {
        console.log(`Rate limited. Waiting ${result.rateLimit.waitTime / 1000} seconds before next check.`);
        // Wait for the specified time
        await new Promise(resolve => setTimeout(resolve, result.rateLimit.waitTime));
        continue;
      }

      // Use recommended polling interval if provided
      if (result.pollingRecommendation) {
        interval = result.pollingRecommendation.interval;
        console.log(`Using recommended polling interval: ${interval / 1000} seconds`);
      } else {
        // Otherwise, implement exponential backoff
        interval = Math.min(interval * 2, maxInterval);
        console.log(`Using exponential backoff interval: ${interval / 1000} seconds`);
      }
    } catch (error) {
      console.error("Exception while calling get-job-result:", error);
      // Implement exponential backoff on error
      interval = Math.min(interval * 2, maxInterval);
      console.log(`Error occurred. Using exponential backoff interval: ${interval / 1000} seconds`);
    }
  }
}

// Example usage:
// const myJobId = "some-unique-job-identifier-123";
// pollJobStatus(myMcpClientInstance, myJobId).then(result => {
//   console.log("Final result:", result);
// });
```

## Error Handling

*   **Input Validation Errors:** Returns an error if `jobId` is missing or not a string.
*   **Job Not Found:** Returns an error if no job exists with the provided `jobId`.
*   **Job Still Processing:** Returns an informational message (not strictly an error) if the job is still `PENDING` or `RUNNING`.
*   **Rate Limiting:** Returns a message indicating the client is polling too frequently, with a recommended wait time.

## Polling Best Practices

When checking the status of long-running jobs, follow these best practices to reduce server load and improve responsiveness:

### Adaptive Polling

The `get-job-result` tool now includes polling recommendations in its response. For optimal performance:

1. **Follow the recommended polling interval**: The response includes a recommended interval (in seconds) for the next status check.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' is running. Status updated at: 2023-06-01T12:34:56.789Z. Progress: Processing batch 2 of 5.\n\nRecommended polling interval: 2 seconds."
    }
  ],
  "isError": false,
  "pollingRecommendation": {
    "interval": 2000,
    "nextCheckTime": 1685623456789
  }
}
```

2. **Implement exponential backoff**: If no recommendation is provided, start with a 1-second interval and double it after each check, up to a maximum of 10 seconds.

3. **Reduce polling frequency for PENDING jobs**: Use longer intervals (5+ seconds) when a job is in the PENDING state.

4. **Increase polling frequency for RUNNING jobs**: Use shorter intervals (1-2 seconds) when a job is in the RUNNING state.

5. **Stop polling when job is COMPLETED or FAILED**: Once a job reaches a terminal state, no further polling is necessary.

### Rate Limiting

The server implements rate limiting for job status checks to prevent excessive polling:

1. **Minimum wait time**: If you check status too frequently, the response will include a wait time before the next check.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' status is being checked too frequently. Please wait 3 seconds before checking again. Current status: RUNNING, last updated at: 2023-06-01T12:34:56.789Z."
    }
  ],
  "isError": false,
  "rateLimit": {
    "waitTime": 3000,
    "nextCheckTime": 1685623459789
  }
}
```

2. **Exponential backoff**: The minimum wait time increases with the number of rapid successive checks.
