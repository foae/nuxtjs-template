<script setup lang="ts">
/**
 * Posts list, server-rendered from Postgres on every request.
 *
 * `useFetch` is the right call here: it runs during SSR, so the HTML arrives
 * populated, and the payload is reused on the client instead of refetching.
 * Use `$fetch` only inside event handlers — calling it at setup level would
 * fetch twice (once on the server, once again on hydration).
 */
import type { Paginated, PostWithAuthor } from '#shared/types/api'

const { data, status } = await useFetch<Paginated<PostWithAuthor>>('/api/posts', {
  query: { limit: 20 }
})
</script>

<template>
  <UContainer class="py-10">
    <div class="mb-8">
      <h1 class="text-2xl font-semibold">
        Posts
      </h1>
      <p class="text-muted mt-1">
        Rendered on the server from Postgres. Drafts are visible only to their author.
      </p>
    </div>

    <div
      v-if="status === 'pending'"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-24 w-full"
      />
    </div>

    <UAlert
      v-else-if="!data?.items.length"
      icon="i-lucide-inbox"
      title="No posts yet"
      description="Sign in and create the first one."
      variant="subtle"
    />

    <div
      v-else
      class="space-y-4"
    >
      <UCard
        v-for="post in data.items"
        :key="post.id"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <NuxtLink
              :to="`/posts/${post.id}`"
              class="font-medium hover:underline"
            >
              {{ post.title }}
            </NuxtLink>
            <p class="text-sm text-muted mt-1 line-clamp-2">
              {{ post.body }}
            </p>
            <p class="text-xs text-dimmed mt-2">
              by {{ post.author.name }}
            </p>
          </div>

          <UBadge
            :color="post.published ? 'success' : 'neutral'"
            :label="post.published ? 'Published' : 'Draft'"
            variant="subtle"
          />
        </div>
      </UCard>

      <p class="text-sm text-muted">
        {{ data.total }} post{{ data.total === 1 ? '' : 's' }}
      </p>
    </div>
  </UContainer>
</template>
