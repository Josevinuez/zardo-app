import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "@/db.server"
import { Keyword, SuggestedKeyword } from "@prisma/client";

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
    "Access-Control-Allow-Headers": "Content-Type, Access-Control-Allow-Headers, Authorization, access-control-allow-origin"
}

export async function loader({ request }: LoaderFunctionArgs) {
    const { searchParams } = new URL(request.url)
    const { id } = Object.fromEntries(searchParams.entries())

    if (!id) throw new Response(JSON.stringify({ error: "No id provided" }), {
        headers: corsHeaders
    })

    console.log("Customer ID:", id)
    let wishlist = await prisma.wishlist.findUnique({
        where: {
            customerId: id,
        },
        include: {
            Keywords: true
        }
    })
    if (!wishlist) {
        wishlist = await prisma.wishlist.create({
            data: {
                customerId: id,
            },
            include: {
                Keywords: true
            }
        })

    }
    const suggestedKeywords: Omit<SuggestedKeyword, "createdAt" | "source" | "id">[] = await prisma.suggestedKeyword.findMany({
        orderBy: {
            createdAt: "asc"
        }
    })
    const keywords: Omit<Keyword, "createdAt" | "id">[] = wishlist.Keywords
    throw new Response(JSON.stringify({ keywords, email: wishlist.email, suggestedKeywords }), {
        headers: corsHeaders
    })

}

export async function action({ request }: ActionFunctionArgs) {
    const data = await request.json()
    const id: string | undefined = data.id;
    const intent: string | undefined = data.intent;
    if (!id) throw new Response(JSON.stringify({ error: "No id provided" }), {
        headers: corsHeaders
    })
    if (!intent) throw new Response(JSON.stringify({ error: "No intent provided" }), {
        headers: corsHeaders
    })

    if (!(await prisma.wishlist.findUnique({
        where: {
            customerId: id.toString().trim()
        }
    }))) throw new Response(JSON.stringify({ error: "No Wishlist found on account." }), {
        headers: corsHeaders
    })

    const keyword: string | undefined = data.keyword;
    const email: string | undefined = data.email;

    switch (intent) {
        case "add_keyword":
            if (!keyword) throw new Response(JSON.stringify({ error: "No keyword provided" }), {
                headers: corsHeaders
            })
            await prisma.wishlist.update({
                where: {
                    customerId: id.trim()
                },
                data: {
                    Keywords: {
                        connectOrCreate: {
                            where: {
                                value: keyword.toLowerCase().trim()
                            },
                            create: {
                                value: keyword.toLowerCase().trim()
                            }
                        }
                    }
                }
            })
            break;
        case "remove_keyword":
            if (!keyword) throw new Response(JSON.stringify({ error: "No keyword provided" }), {
                headers: corsHeaders
            })
            await prisma.wishlist.update({
                where: {
                    customerId: id.trim()
                },
                data: {
                    Keywords: {
                        disconnect: {
                            value: keyword.toLowerCase().trim()
                        }
                    }
                }
            })
            break;
        case "set_email":
            if (!email) throw new Response(JSON.stringify({ error: "No email provided" }), {
                headers: corsHeaders
            })
            await prisma.wishlist.update({
                where: {
                    customerId: id.trim()
                },
                data: {
                    email: email.trim()
                }
            })
            break;
        case "unsubscribe":
            await prisma.wishlist.update({
                where: {
                    customerId: id.trim()
                },
                data: {
                    email: null
                }
            })
            break;
        default:
            throw new Response(JSON.stringify({ error: "Unknown intent..." }), {
                headers: corsHeaders
            })
    }
    const wishlist = await prisma.wishlist.findUnique({
        where: {
            customerId: id.trim()
        },
        include: {
            Keywords: true
        }
    })
    if (!wishlist) return { error: "No Wishlist found on account." }
    const keywords: Pick<Keyword, "id" | "value">[] = wishlist.Keywords
    const suggestedKeywords: Omit<SuggestedKeyword, "createdAt" | "source" | "id">[] = await prisma.suggestedKeyword.findMany({
        orderBy: {
            createdAt: "asc"
        }
    })
    throw new Response(JSON.stringify({ keywords, email: wishlist.email, suggestedKeywords }), {
        headers: corsHeaders
    })
}