<script setup lang="ts">
import type { PostWithAuthor } from '#shared/types/api'

const route = useRoute()
const { user } = useUserSession()

/**
 * A 404 from the API must become a real 404 page, not an empty render.
 * `useFetch` surfaces it in `error`, and `createError({ fatal: true })`
 * hands it to the error boundary with the right status code.
 */
const { data: post, error } = await useFetch<PostWithAuthor>(`/api/posts/${route.params.id}`)

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 500,
    statusMessage: error.value.statusMessage ?? 'Failed to load post',
    fatal: true
  })
}

useSeoMeta({ title: () => post.value?.title ?? 'Post' })

const isAuthor = computed(() => !!user.value && post.value?.author.id === user.value.id)
</script>

<template>
  <UContainer
    v-if="post"
    class="py-10 max-w-3xl"
  >
    <UButton
      to="/"
      icon="i-lucide-arrow-left"
      label="All posts"
      color="neutral"
      variant="link"
      class="mb-4 -ml-3"
    />

    <div class="flex items-start justify-between gap-4">
      <h1 class="text-2xl font-display font-semibold tracking-tight">
        {{ post.title }}
      </h1>
      <div class="flex items-center gap-2 shrink-0">
        <UBadge
          v-if="!post.published"
          color="neutral"
          variant="subtle"
          label="Draft"
        />
        <UButton
          v-if="isAuthor"
          :to="`/posts/${post.id}/edit`"
          icon="i-lucide-pencil"
          size="sm"
          color="neutral"
          variant="subtle"
          label="Edit"
        />
      </div>
    </div>

    <p class="text-sm text-muted mt-2">
      by {{ post.author.name }} ·
      <NuxtTime
        :datetime="post.createdAt"
        year="numeric"
        month="short"
        day="numeric"
        locale="en-US"
      />
    </p>

    <UAlert
      v-if="isAuthor && !post.published"
      class="mt-6"
      icon="i-lucide-eye-off"
      variant="subtle"
      title="Only you can see this"
      description="This post is a draft. Publish it to make it visible to everyone."
    />

    <article class="mt-6 whitespace-pre-wrap leading-relaxed">
      {{ post.body }}
    </article>
  </UContainer>
</template>
