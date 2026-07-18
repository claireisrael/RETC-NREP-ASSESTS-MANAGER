import React from "react"
import Link from "next/link"

const buttonVariants = {
  default: "org-button--default",
  destructive: "org-button--destructive",
  outline: "org-button--outline",
  secondary: "org-button--secondary",
  ghost: "org-button--ghost",
  link: "org-button--link",
  accent: "org-button--accent",
  highlight: "org-button--highlight",
  request: "org-button--request",
}

const buttonSizes = {
  default: "org-button--size-default",
  sm: "org-button--size-sm",
  lg: "org-button--size-lg",
  icon: "org-button--size-icon",
}

export function Button({
  className = "",
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}) {
  const variantClass = buttonVariants[variant] || buttonVariants.default
  const sizeClass = buttonSizes[size] || buttonSizes.default
  const classes = `org-button ${variantClass} ${sizeClass} ${className}`.trim()

  if (asChild && React.Children.count(children) === 1) {
    return React.cloneElement(React.Children.only(children), {
      className: `${classes} ${(children.props?.className || "").trim()}`.trim(),
      ...props,
    })
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}

export function ButtonLink({
  href,
  children,
  className = "",
  variant = "default",
  size = "default",
  ...props
}) {
  const variantClass = buttonVariants[variant] || buttonVariants.default
  const sizeClass = buttonSizes[size] || buttonSizes.default
  const classes = `org-button ${variantClass} ${sizeClass} ${className}`.trim()

  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  )
}