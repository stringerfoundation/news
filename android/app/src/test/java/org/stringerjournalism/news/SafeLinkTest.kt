package org.stringerjournalism.news

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SafeLinkTest {
    @Test
    fun onlyCredentialFreeHttpLinksAreAllowedForExternalNavigation() {
        assertEquals("https://example.com/story", safeExternalUrl("https://example.com/story"))
        assertNull(safeExternalUrl("javascript:alert(1)"))
        assertNull(safeExternalUrl("https://user:password@example.com/story"))
    }
}
