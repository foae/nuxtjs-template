<script setup lang="ts">
/**
 * Posts list, server-rendered from Postgres on every request.
 *
 * `useFetch` is the right call here: it runs during SSR, so the HTML arrives
 * populated, and the payload is reused on the client instead of refetching.
 * Use `$fetch` only inside event handlers — calling it at setup level would
 * fetch twice (once on the server, again on hydration).
 *
 * Pagination lives in the URL (`/?page=2`) rather than component state, so a
 * page is shareable, survives reload, and renders correctly on the server.
 * Because `query` is a computed, `useFetch` refetches whenever it changes —
 * do not add a manual watcher.
 */
import type { Paginated, PostWithAuthor } from '#shared/types/api'

const PER_PAGE = 10

const route = useRoute()

// Clamp: a hand-edited `?page=0` or `?page=abc` must not produce a negative
// offset, which the API would reject with a 422.
const page = computed(() => {
  const raw = Number(route.query.page)
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
})

const { data, status } = await useFetch<Paginated<PostWithAuthor>>('/api/posts', {
  query: computed(() => ({
    limit: PER_PAGE,
    offset: (page.value - 1) * PER_PAGE
  }))
})

function goToPage(next: number) {
  return navigateTo({ query: next === 1 ? {} : { page: next } })
}
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

      <div class="flex items-center justify-between pt-2">
        <p class="text-sm text-muted">
          {{ data.total }} post{{ data.total === 1 ? '' : 's' }}
        </p>

        <UPagination
          v-if="data.total > PER_PAGE"
          :page="page"
          :items-per-page="PER_PAGE"
          :total="data.total"
          @update:page="goToPage"
        />
      </div>
    </div>
  </UContainer>
</template>
